'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { AlertTriangle, Check, Loader2, Pencil, RotateCcw, ScanText, Upload, X } from 'lucide-react'
import { liveReportImageService, ocrService, reportImageService, reportService } from '@/lib/services/dataService'
import {
  Brand,
  Campaign,
  FinalReportRecap,
  OcrCropBox,
  OcrReviewData,
  Platform,
  ReportDashboardPlatform,
  LiveReportImage,
  ReportImageCategory,
  Shift,
  ShiftRegistration,
  User,
} from '@/lib/types/database.types'
import { parseOcrValue } from '@/lib/utils/ocrMetrics'
import {
  canonicalizeOcrReview,
  clearOcrDerivedMetricState,
  clearReviewMetric,
  confirmAllReviewMetrics,
  confirmReviewMetric,
  markMetricManual,
  ocrCandidateMetricKeys,
  parseAndApplyOcrText,
  resetMetricToOcr,
  reviewInputValues,
  reviewRequiredCount,
  type OcrMetricFilter,
  type OcrTextApplicationResult,
} from '@/lib/utils/ocrReview'
import {
  applySelectedMetricsToState,
  parseMetricInputValue,
  platformCanonicalMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'
import {
  defaultFinalReportMetricFilter,
  finalReportMetricKeysForFilter,
} from '@/lib/utils/finalReportMetricFilter'
import { serializeFinalReportMetricState } from '@/lib/utils/ocrMetricSerialization'
import { metricTranslationKeys } from '@/lib/reportMetricLabels'
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
import { OcrMetricFilterBar } from '@/components/features/reports/OcrMetricReviewField'
import { OcrTextApplicationSummary } from '@/components/features/reports/OcrTextApplicationSummary'
import { OcrBoundMetricFields } from '@/components/features/reports/OcrBoundMetricFields'
import { OcrCandidateDiagnosticsTable } from '@/components/features/reports/OcrCandidateDiagnosticsTable'
import { AlertDialog } from '@/components/ui/alert-dialog'
import {
  emptyFinalReportRecap,
  finalReportRecapFields,
  normalizeFinalReportRecap,
} from '@/lib/utils/finalReportRecap'
import {
  moveLiveReportImage,
  removeLiveReportImage,
  revokeLiveReportImageObjectUrl,
  setLiveReportCover,
  updateLiveReportImageMetadata,
} from '@/lib/utils/liveReportImages'
import { LiveReportImageEditor } from '@/components/features/reports/LiveReportImageGallery'
import {
  VisionOcrActionGroup,
  VisionOcrReviewPanel,
  type VisionOcrMode,
} from '@/components/features/reports/VisionOcrControls'

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
  const liveImagesRef = React.useRef<LiveReportImage[]>([])
  const persistedLiveImageUrlsRef = React.useRef(new Set<string>())
  const manualMetricKeysRef = React.useRef(new Set<CanonicalMetricKey>())
  const ocrDerivedMetricKeysRef = React.useRef(new Set<CanonicalMetricKey>())
  const cropProposalKeyRef = React.useRef('')
  const [shiftId, setShiftId] = React.useState('')
  const [dashboardPlatform, setDashboardPlatform] = React.useState<ReportDashboardPlatform>('other')
  const [cropBox, setCropBox] = React.useState<OcrCropBox>(defaultOcrCrop('other'))
  const [metricValues, setMetricValues] = React.useState<MetricState>({})
  const [review, setReview] = React.useState<OcrReviewData>(emptyReview)
  const [ocrAcknowledged, setOcrAcknowledged] = React.useState(false)
  const [editingMetrics, setEditingMetrics] = React.useState(false)
  const [images, setImages] = React.useState<PendingImage[]>([])
  const [liveImages, setLiveImages] = React.useState<LiveReportImage[]>([])
  const [replayUrl, setReplayUrl] = React.useState('')
  const [dashboardUrl, setDashboardUrl] = React.useState('')
  const [insightsGood, setInsightsGood] = React.useState('')
  const [insightsImprovement, setInsightsImprovement] = React.useState('')
  const [finalRecap, setFinalRecap] = React.useState<FinalReportRecap>(emptyFinalReportRecap)
  const [reviewing, setReviewing] = React.useState(false)
  const [proposingCrop, setProposingCrop] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [rawOcrText, setRawOcrText] = React.useState('')
  const [ocrApplicationResult, setOcrApplicationResult] = React.useState<OcrTextApplicationResult | null>(null)
  const [metricFilter, setMetricFilter] = React.useState<OcrMetricFilter>(defaultFinalReportMetricFilter)
  const [showReviewWarning, setShowReviewWarning] = React.useState(false)
  const [visionMode, setVisionMode] = React.useState<VisionOcrMode | null>(null)
  const [visionResults, setVisionResults] = React.useState<HybridMetricResult[]>([])
  const [visionScanning, setVisionScanning] = React.useState(false)

  const selectedShift = completedShifts.find(shift => shift.id === shiftId)
  const dashboardImage = images.find(image => image.type === 'dashboard')

  React.useEffect(() => {
    if (dashboardPlatform !== 'tiktok_shop' || !dashboardImage?.url) {
      cropProposalKeyRef.current = ''
      setProposingCrop(false)
      return
    }
    const proposalKey = `${dashboardPlatform}:${dashboardImage.url}`
    if (cropProposalKeyRef.current === proposalKey) return
    cropProposalKeyRef.current = proposalKey
    setProposingCrop(true)
    setCropBox(defaultOcrCrop('tiktok_shop'))
    let active = true
    void proposeTikTokKpiCrop(dashboardImage.url)
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
  }, [dashboardImage?.url, dashboardPlatform])

  React.useEffect(() => {
    if (!open) {
      liveImagesRef.current
        .filter(image => !persistedLiveImageUrlsRef.current.has(image.file_url))
        .forEach(image => revokeLiveReportImageObjectUrl(image))
      liveImagesRef.current = []
      setLiveImages([])
      return
    }
    const initialShift = completedShifts[0]
    const initialPlatform = inferDashboardPlatform(initialShift, platforms)
    setShiftId(initialShift?.id || '')
    setDashboardPlatform(initialPlatform)
    setCropBox(defaultOcrCrop(initialPlatform))
    setMetricValues({})
    manualMetricKeysRef.current.clear()
    ocrDerivedMetricKeysRef.current.clear()
    setReview(emptyReview())
    setOcrAcknowledged(false)
    setEditingMetrics(false)
    setImages([])
    liveImagesRef.current
      .filter(image => !persistedLiveImageUrlsRef.current.has(image.file_url))
      .forEach(image => revokeLiveReportImageObjectUrl(image))
    persistedLiveImageUrlsRef.current.clear()
    setLiveImages([])
    setReplayUrl('')
    setDashboardUrl('')
    setInsightsGood('')
    setInsightsImprovement('')
    setFinalRecap(emptyFinalReportRecap())
    setRawOcrText('')
    setOcrApplicationResult(null)
    setMetricFilter(defaultFinalReportMetricFilter)
    setShowReviewWarning(false)
    setVisionMode(null)
    setVisionResults([])
    setVisionScanning(false)
  // Opening the modal initializes a fresh draft. Prop-array identity changes
  // while it is open must not erase OCR candidates or autofilled metrics.
  }, [open])

  React.useEffect(() => {
    liveImagesRef.current = liveImages
  }, [liveImages])

  React.useEffect(() => () => {
    liveImagesRef.current
      .filter(image => !persistedLiveImageUrlsRef.current.has(image.file_url))
      .forEach(image => revokeLiveReportImageObjectUrl(image))
  }, [])

  const changeShift = (value: string) => {
    const nextShift = completedShifts.find(shift => shift.id === value)
    const nextPlatform = inferDashboardPlatform(nextShift, platforms)
    setShiftId(value)
    setDashboardPlatform(nextPlatform)
    setCropBox(defaultOcrCrop(nextPlatform))
    resetDraftMetrics()
  }

  const resetDraftMetrics = () => {
    setMetricValues({})
    manualMetricKeysRef.current.clear()
    ocrDerivedMetricKeysRef.current.clear()
    setReview(emptyReview())
    setOcrApplicationResult(null)
    setOcrAcknowledged(false)
    setEditingMetrics(false)
    setVisionResults([])
  }

  const resetExtracted = () => {
    setMetricValues(current => clearOcrDerivedMetricState(
      current,
      ocrDerivedMetricKeysRef.current,
      manualMetricKeysRef.current,
    ))
    ocrDerivedMetricKeysRef.current.clear()
    setReview(emptyReview())
    setOcrApplicationResult(null)
    setOcrAcknowledged(false)
    setEditingMetrics(manualMetricKeysRef.current.size > 0)
    setVisionResults([])
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
    setReview(result.review)
    setOcrApplicationResult(result)
    setOcrAcknowledged(false)
    setEditingMetrics(true)
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

  const runOcrReview = async () => {
    if (reviewing || proposingCrop) return null
    if (dashboardPlatform === 'other') {
      toast({ title: t('dashboardPlatformRequired'), description: t('dashboardPlatformRequiredHelp'), variant: 'destructive' })
      return null
    }
    if (!images.some(image => image.type === 'dashboard')) {
      toast({ title: t('dashboardImageRequired'), description: t('dashboardImageRequiredHelp'), variant: 'destructive' })
      return null
    }
    setReviewing(true)
    setOcrAcknowledged(false)
    setEditingMetrics(false)
    const overwriteManualEdits = review.status !== 'waiting' && review.status !== 'processing'
    setReview({ status: 'processing', source_platform: dashboardPlatform, metrics: {} })
    try {
      const dashboardImage = images.find(image => image.type === 'dashboard')
      const candidate = canonicalizeOcrReview(await ocrService.extractDashboardMetrics(
        dashboardPlatform,
        rawOcrText || undefined,
        dashboardImage?.url,
        cropBox,
      ))
      const incomingMetricKeys = ocrCandidateMetricKeys(candidate)
      const recognizedText = rawOcrText.trim() || candidate.raw_output?.trim() || ''
      if (recognizedText) {
        setRawOcrText(recognizedText)
      }
      if (incomingMetricKeys.length > 0) {
        setReview(candidate)
        setMetricValues(current => {
          const merged = applySelectedMetricsToState(current, candidate, {
            protectedKeys: manualMetricKeysRef.current,
            overwriteProtected: overwriteManualEdits,
          })
          incomingMetricKeys.forEach(key => ocrDerivedMetricKeysRef.current.add(key))
          if (overwriteManualEdits) {
            incomingMetricKeys.forEach(key => manualMetricKeysRef.current.delete(key))
          }
          return merged
        })
      } else if (recognizedText) {
        applyRawOcrText(recognizedText, candidate)
      } else {
        setReview(candidate)
      }
      setEditingMetrics(true)
      if (incomingMetricKeys.length > 0) {
        toast({
          title: t('ocrResults'),
          description: t('ocrApplySummary', {
            applied: incomingMetricKeys.length,
            review: reviewRequiredCount(candidate),
          }),
          variant: 'success',
        })
      } else if (!recognizedText) {
        toast({
          title: candidate.status === 'unavailable' ? t('dashboardImageRequired') : t('metricReviewRequired'),
          description: candidate.status === 'unavailable' ? t('ocrUnavailableHelp') : t('ocrReviewHelp'),
          variant: candidate.status === 'unavailable' ? 'destructive' : 'success',
        })
      }
      return candidate
    } catch (error) {
      setReview({ status: 'failed', source_platform: dashboardPlatform, metrics: {}, error_message: error instanceof Error ? error.message : t('ocrFailed') })
      return null
    } finally {
      setReviewing(false)
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
    setReview(current => mergeHybridResultsIntoReview(current, results))
    setEditingMetrics(true)
    setOcrAcknowledged(false)
  }

  const runVisionMode = async (mode: VisionOcrMode) => {
    if (reviewing || visionScanning || proposingCrop) return
    setVisionMode(mode)
    if (mode === 'local') {
      await runOcrReview()
      setVisionMode(null)
      return
    }
    const image = images.find(candidate => candidate.type === 'dashboard')
    const visionPlatform = toVisionPlatform(dashboardPlatform)
    if (!image || !visionPlatform) {
      toast({ title: t('ocrResults'), description: t('visionOcrInvalidCrop'), variant: 'destructive' })
      setVisionMode(null)
      return
    }
    setVisionScanning(true)
    try {
      const localReview = mode === 'compare' ? await runOcrReview() : null
      const response = await requestVisionOcr({ platform: dashboardPlatform, imageUrl: image.url, cropBox })
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

  const setMetric = (key: CanonicalMetricKey, value: string) => {
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({ ...current, [key]: parseMetricInputValue(value) }))
    setOcrAcknowledged(false)
    setReview(current => markMetricManual(current, key, value, currentUser?.id || 'unknown'))
  }

  const confirmMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    setReview(current => confirmReviewMetric(current, key, metricValues[key] ?? null, currentUser.id))
  }

  const resetMetric = (key: CanonicalMetricKey) => {
    setReview(current => {
      const next = resetMetricToOcr(current, key)
      const value = reviewInputValues(next)[key] ?? ''
      manualMetricKeysRef.current.delete(key)
      ocrDerivedMetricKeysRef.current.add(key)
      setMetricValues(values => ({ ...values, [key]: value }))
      return next
    })
    setOcrAcknowledged(false)
  }

  const clearMetric = (key: CanonicalMetricKey) => {
    if (!currentUser) return
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({ ...current, [key]: null }))
    setReview(current => clearReviewMetric(current, key, currentUser.id))
    setOcrAcknowledged(false)
  }

  const confirmAllMetrics = () => {
    if (!currentUser) return
    setReview(current => confirmAllReviewMetrics(current, metricValues, currentUser.id))
    setOcrAcknowledged(true)
  }

  const mapUnmappedField = (index: number, key: CanonicalMetricKey) => {
    const field = review.unmapped_fields?.[index]
    if (!field) return
    const parsed = parseOcrValue(field.original_value)
    manualMetricKeysRef.current.add(key)
    setMetricValues(current => ({
      ...current,
      [key]: typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null,
    }))
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
      if (dashboardPlatform === 'tiktok_shop') setProposingCrop(true)
      setImages(current => [...current, ...files.map(file => ({
        url: URL.createObjectURL(file), name: file.name, type: 'dashboard' as const, mime: file.type, size: file.size,
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
    if (reviewing || visionScanning || submitting) return
    if (!validateSubmission()) return
    if (reviewRequiredCount(review) > 0) {
      setShowReviewWarning(true)
      return
    }
    void persistDraft()
  }

  const persistDraft = async () => {
    if (!currentUser || !selectedShift) return
    if (dashboardPlatform === 'other') return

    setSubmitting(true)
    try {
      const serializedMetrics = serializeFinalReportMetricState(dashboardPlatform, metricValues)
      const report = await reportService.create({
        shift_id: selectedShift.id,
        ...serializedMetrics,
        dashboard_platform: dashboardPlatform,
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
      await Promise.all([...liveImages]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map(image => liveReportImageService.create({
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
      liveImages.forEach(image => persistedLiveImageUrlsRef.current.add(image.file_url))
      toast({ title: t('submitted'), description: t('finalReportSavedHelp'), variant: 'success' })
      onSuccess()
    } catch (error) {
      toast({ title: t('saveFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const visibleMetricKeys = [...platformCanonicalMetricKeys(dashboardPlatform)]
  const lowConfidence = reviewRequiredCount(review)
  const filteredMetricKeys = finalReportMetricKeysForFilter({
    platform: dashboardPlatform,
    filter: metricFilter,
    values: metricValues,
    review,
  })
  const filteredMainMetricKeys = filteredMetricKeys.main
  const filteredSupplementaryMetricKeys = filteredMetricKeys.supplementary
  const hasSupplementaryMetrics = dashboardPlatform === 'shopee_live'
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
            <label className="text-sm font-medium">{t('platformDashboardType')} *<Select value={dashboardPlatform} disabled={inferredPlatform !== 'other'} onValueChange={value => { const next = value as ReportDashboardPlatform; setDashboardPlatform(next); setCropBox(defaultOcrCrop(next)); resetExtracted() }}><SelectTrigger className="mt-1 w-full" data-testid="report-platform-selector"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tiktok_shop">TikTok Shop</SelectItem><SelectItem value="shopee_live">Shopee Live</SelectItem>{inferredPlatform === 'other' && <SelectItem value="other">{t('selectDashboardPlatform')}</SelectItem>}</SelectContent></Select></label>
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
              <div className="flex flex-wrap gap-2"><Button type="button" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />{t('uploadDashboard')}</Button><input ref={fileInputRef} className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={addImages} data-testid="report-dashboard-image-upload" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{images.map(image => <div className="relative min-w-0" key={image.url}><img src={image.url} alt={image.name} className="aspect-video w-full rounded border object-cover" /><p className="truncate pt-1 text-xs">{image.name}</p><Button aria-label={`${t('removeImage')} ${image.name}`} type="button" size="icon" variant="destructive" className="absolute -right-2 -top-2 h-6 w-6" onClick={() => removeImage(image)}><X className="h-3 w-3" /></Button></div>)}</div>
          </section>

          <section className="space-y-4 rounded-lg border border-dashed p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{t('ocrReview')}</h3><span data-testid="report-ocr-completion-status" data-ocr-status={review.status}><OcrStatus status={review.status} /></span></div><p className="mt-1 text-sm text-muted-foreground">{t('ocrReviewHelp')}</p>{review.engine && <p className="mt-1 text-xs text-muted-foreground">{t('engine')}: {review.engine} · {t('recognitionLanguage')}: {review.recognition_language} · {t('overallConfidence')}: {review.overall_confidence?.toFixed(1) ?? '—'}%</p>}</div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={resetExtracted} disabled={reviewing || visionScanning}><RotateCcw className="mr-2 h-4 w-4" />{t('resetResults')}</Button>
                {review.status === 'review_required' && <Button type="button" variant="outline" onClick={() => setEditingMetrics(value => !value)}><Pencil className="mr-2 h-4 w-4" />{editingMetrics ? t('finishEditing') : t('editOcrMetrics')}</Button>}
              </div>
            </div>
            <VisionOcrActionGroup
              activeMode={visionMode}
              busy={reviewing || visionScanning || proposingCrop}
              disabled={!dashboardImage || dashboardPlatform === 'other'}
              localButtonTestId="report-run-ocr-button"
              onRun={runVisionMode}
            />
            {dashboardImage && <OcrCropPreview imageUrl={dashboardImage.url} platform={dashboardPlatform} value={cropBox} onChange={setCropBox} onRetry={runOcrReview} review={review} disabled={reviewing || visionScanning || proposingCrop} />}
            <VisionOcrReviewPanel results={visionResults} onResolve={resolveVisionResult} />
            <label className="block text-sm font-medium">{t('trustedOcrText')} ({t('optional')})
              <Textarea className="mt-1 min-h-32 font-mono text-xs" value={rawOcrText} onChange={event => setRawOcrText(event.target.value)} placeholder={'Sales: 21.281.718,00\nEngaged Viewer: 521\nOrders: 109'} data-testid="report-ocr-corrected-text" />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!rawOcrText.trim() || dashboardPlatform === 'other' || reviewing || visionScanning}
              onClick={() => applyRawOcrText()}
              data-testid="apply-report-ocr-text"
            >
              <ScanText className="mr-2 h-4 w-4" />{t('applyOcrData')}
            </Button>
            <OcrTextApplicationSummary result={ocrApplicationResult} />
            <OcrCandidateDiagnosticsTable
              review={review}
              canExport={Boolean(currentUser && hasPermission(currentUser, 'audit.view'))}
            />
            {lowConfidence > 0 && <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />{t('lowConfidenceCount', { count: lowConfidence })}</p>}
            {review.status === 'failed' && <p className="text-sm text-red-700">{review.error_message}</p>}
            {dashboardPlatform !== 'other' && <>
              <OcrMetricFilterBar value={metricFilter} onChange={setMetricFilter} reviewCount={lowConfidence} />
              <div data-testid="ocr-main-metrics" data-ocr-platform={dashboardPlatform}>
                <h4 className="mb-2 text-sm font-semibold">{t('platformLivestreamMetrics')}</h4>
                {filteredMainMetricKeys.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <OcrBoundMetricFields
                      metricKeys={filteredMainMetricKeys}
                      values={metricValues}
                      review={review}
                      editable={editingMetrics}
                      canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                      onChange={setMetric}
                      onEdit={() => setEditingMetrics(true)}
                      onConfirm={confirmMetric}
                      onReset={resetMetric}
                      onClear={clearMetric}
                    />
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="ocr-main-metrics-empty">
                    {t(metricFilter === 'data' ? 'noMetricsWithData' : 'noMetricsForSelectedFilter')}
                  </p>
                )}
              </div>
              {hasSupplementaryMetrics && (
                <div data-testid="ocr-supplementary-metrics">
                  <h4 className="mb-2 text-sm font-semibold">{t('platformSpecificMetrics')}</h4>
                  {filteredSupplementaryMetricKeys.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <OcrBoundMetricFields
                        metricKeys={filteredSupplementaryMetricKeys}
                        values={metricValues}
                        review={review}
                        editable={editingMetrics}
                        canReview={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
                        onChange={setMetric}
                        onEdit={() => setEditingMetrics(true)}
                        onConfirm={confirmMetric}
                        onReset={resetMetric}
                        onClear={clearMetric}
                      />
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="ocr-supplementary-metrics-empty">
                      {t(metricFilter === 'data' ? 'noMetricsWithData' : 'noMetricsForSelectedFilter')}
                    </p>
                  )}
                </div>
              )}
              {(review.status === 'review_required' || review.status === 'unavailable') && <>
              {review.unmapped_fields && review.unmapped_fields.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="report-ocr-unmapped-section"><h4 className="font-semibold text-amber-900">{t('rejectedUnmappedOcrFields')}</h4><div className="mt-2 space-y-2">{review.unmapped_fields.map((field, index) => <div className="grid gap-2 rounded border border-amber-200 bg-white p-2 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,.8fr)] sm:items-center" key={`${field.original_label}-${index}`} data-testid="ocr-unmapped-field" data-ocr-original-label={field.original_label}><div className="text-sm text-amber-900"><p>{t('originalLabel')}: {field.original_label} · {t('originalValue')}: {field.original_value || '—'}</p><p className="text-xs">{t('source')}: {field.source || t('unknownSource')}{field.rejection_reason ? ` · ${t('unmappedMetricHelp')}` : ''}</p></div><Select onValueChange={value => mapUnmappedField(index, value as CanonicalMetricKey)}><SelectTrigger><SelectValue placeholder={t('mapToNormalizedMetric')} /></SelectTrigger><SelectContent>{visibleMetricKeys.map(key => <SelectItem value={key} key={key}>{t(metricTranslationKeys[key])}</SelectItem>)}</SelectContent></Select></div>)}</div></div>}
              {review.raw_diagnostic_output && <details className="rounded-lg bg-muted/50 p-3 text-sm" data-testid="report-ocr-raw-diagnostics"><summary className="cursor-pointer font-medium">{t('rawOcrOutput')}</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{review.raw_diagnostic_output}</pre></details>}
              <div className="flex justify-end"><Button type="button" variant={ocrAcknowledged ? 'outline' : 'default'} onClick={confirmAllMetrics}><Check className="mr-2 h-4 w-4" />{ocrAcknowledged ? t('metricsReviewedForDraft') : t('confirmAllReviewed')}</Button></div>
              </>}
            </>}
          </section>

          <LiveReportImageEditor
            images={liveImages}
            uploadedBy={currentUser?.id}
            editable={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
            canDelete={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
            canReorderAndSetCover={Boolean(currentUser && hasPermission(currentUser, 'reports.submit'))}
            onAdd={incoming => setLiveImages(current => [...current, ...incoming])}
            onUpdate={(image, patch) => {
              const result = updateLiveReportImageMetadata(liveImages, image.id, patch)
              if (result.error) {
                toast({ title: t('validationError'), variant: 'destructive' })
                return
              }
              setLiveImages(result.images)
            }}
            onDelete={image => {
              const result = removeLiveReportImage(liveImages, image.id)
              if (result.removed) revokeLiveReportImageObjectUrl(result.removed)
              setLiveImages(result.images)
            }}
            onMove={(image, direction) => setLiveImages(current => moveLiveReportImage(current, image.id, direction))}
            onSetCover={image => setLiveImages(current => setLiveReportCover(current, image.id))}
          />

          <section className="space-y-4 rounded-lg border p-4" data-testid="final-report-notes-section">
            <h3 className="font-semibold">{t('notes')}</h3>
            <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">{t('replayUrl')}<Input className="mt-1" type="url" value={replayUrl} onChange={event => setReplayUrl(event.target.value)} /></label><label className="text-sm font-medium">{t('dashboardUrl')}<Input className="mt-1" type="url" value={dashboardUrl} onChange={event => setDashboardUrl(event.target.value)} /></label><label className="text-sm font-medium">{t('whatWentWell')}<Textarea className="mt-1" value={insightsGood} onChange={event => setInsightsGood(event.target.value)} /></label><label className="text-sm font-medium">{t('improvementAreas')}<Textarea className="mt-1" value={insightsImprovement} onChange={event => setInsightsImprovement(event.target.value)} /></label></div>
          </section>

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
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('cancel')}</Button><Button type="submit" disabled={submitting || reviewing || visionScanning}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('saveFinalReport')}</Button></DialogFooter>
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
