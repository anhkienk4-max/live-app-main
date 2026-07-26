'use client'

import React from 'react'
import { AlertTriangle, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { OcrMetricValue, ReportMetricKey } from '@/lib/types/database.types'
import type { OcrMetricFilter } from '@/lib/utils/ocrReview'
import {
  metricHelpTranslationKeys,
  metricStatusTranslationKeys,
  metricTranslationKeys,
} from '@/lib/reportMetricLabels'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getReportMetricInputKind, getReportMetricInputProps } from '@/lib/utils/reportMetricInput'

interface OcrMetricReviewFieldProps {
  metricKey: ReportMetricKey
  metric?: OcrMetricValue
  value: string
  editable: boolean
  canReview: boolean
  onChange: (value: string) => void
  onEdit?: () => void
  onConfirm?: () => void
  onReset?: () => void
  onClear?: () => void
}

export function OcrMetricReviewField({
  metricKey,
  metric,
  value,
  editable,
  canReview,
  onChange,
  onEdit,
  onConfirm,
  onReset,
  onClear,
}: OcrMetricReviewFieldProps) {
  const { t } = useTranslation()
  const status = metric?.status || (value ? 'manual' : 'empty')
  const inputKind = getReportMetricInputKind(metricKey)
  const needsReview = status === 'review_required' || status === 'low_confidence' || metric?.needs_review
  const helpKey = metricHelpTranslationKeys[metricKey]
  const confidence = metric?.value_confidence == null
    ? metric?.confidence
    : `${Math.round(metric.value_confidence)}%`
  const source = metric?.source === 'raw_text_exact'
    || metric?.source === 'raw_text_sequence'
    || metric?.source === 'card_exact'
    || metric?.source === 'word_box_exact'
    || metric?.source === 'spatial_fallback'
    ? metric.source
    : metric?.source === 'manual'
      ? t('manualInput')
      : metric?.source === 'image_ocr'
        ? t('imageOcr')
        : metric?.source === 'trusted_text' || metric?.source === 'local_tesseract_text'
          ? t('trustedOcrText')
          : t('unknownSource')
  const valuePass = metric?.value_source_pass === 'label'
    ? t('labelPass')
    : metric?.value_source_pass === 'numeric'
      ? t('numericPass')
      : metric?.value_source_pass === 'card'
        ? t('cardPass')
        : t('unknownSource')

  return (
    <div
      className={`rounded-lg border p-3 text-sm ${needsReview ? 'border-amber-400 bg-amber-50' : status === 'rejected' ? 'border-red-300 bg-red-50' : ''}`}
      data-ocr-status={status}
      data-testid={`ocr-metric-${metricKey}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <label className="font-medium" htmlFor={`ocr-metric-input-${metricKey}`}>
            {t(metricTranslationKeys[metricKey])}
          </label>
          {helpKey && <p className="text-xs text-muted-foreground" title={t(helpKey)}>{t(helpKey)}</p>}
        </div>
        <Badge variant="outline" className={needsReview ? 'border-amber-500 bg-amber-100 text-amber-900' : ''}>
          {t(metricStatusTranslationKeys[status])}
        </Badge>
      </div>
      <Input
        id={`ocr-metric-input-${metricKey}`}
        data-testid={`ocr-metric-input-${metricKey}`}
        className="mt-2"
        {...getReportMetricInputProps(metricKey)}
        value={value}
        disabled={!editable || status === 'rejected'}
        onChange={event => onChange(event.target.value)}
      />
      {inputKind === 'percentage' && <p className="mt-1 text-xs text-muted-foreground">{t('percentageInputHelp')}</p>}
      {needsReview && (
        <div className="mt-2 rounded border border-amber-200 bg-amber-100/70 p-2 text-xs text-amber-950">
          <p className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('statusReviewRequired')}
          </p>
          <p className="mt-1">{t('reviewRequiredHelp')}</p>
        </div>
      )}
      {metric && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>{t('originalLabel')}: {metric.original_label || '—'}</p>
          <p>{t('originalValue')}: {metric.raw_value || '—'} · {t('confidence')}: {confidence || '—'}</p>
          <p>{t(metricTranslationKeys[metric.normalized_key || metricKey])} ({metric.normalized_key || metricKey})</p>
          <p>{t('source')}: {source} · {t('labelSource')}: {metric.label_source === 'platform_layout' ? t('platformLayout') : t('ocrText')}</p>
          <p>{t('valuePass')}: {valuePass}</p>
          {metric.conflict_warning && <p className="text-amber-700">{metric.conflict_warning}</p>}
        </div>
      )}
      {canReview && metric && status !== 'rejected' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {needsReview && onConfirm && <Button type="button" size="xs" onClick={onConfirm}><Check className="h-3.5 w-3.5" />{t('confirmValue')}</Button>}
          {!editable && onEdit && <Button type="button" size="xs" variant="outline" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />{t('editValue')}</Button>}
          {metric.candidate_value != null && onReset && <Button type="button" size="xs" variant="outline" onClick={onReset}><RotateCcw className="h-3.5 w-3.5" />{t('resetToOcr')}</Button>}
          {value && onClear && <Button type="button" size="xs" variant="ghost" onClick={onClear}><Trash2 className="h-3.5 w-3.5" />{t('clearValue')}</Button>}
        </div>
      )}
    </div>
  )
}

export function OcrMetricFilterBar({
  value,
  onChange,
  reviewCount,
}: {
  value: OcrMetricFilter
  onChange: (value: OcrMetricFilter) => void
  reviewCount: number
}) {
  const { t } = useTranslation()
  const options: Array<{ value: OcrMetricFilter; label: string }> = [
    { value: 'data', label: t('metricsWithData') },
    { value: 'all', label: t('allMetrics') },
    { value: 'review_required', label: t('reviewRequiredCount', { count: reviewCount }) },
    { value: 'confirmed', label: t('confirmedMetrics') },
  ]
  return <div className="flex flex-wrap gap-1 rounded-lg border p-1">{options.map(option => <Button type="button" size="xs" variant={value === option.value ? 'secondary' : 'ghost'} onClick={() => onChange(option.value)} data-testid={`ocr-metric-filter-${option.value}`} key={option.value}>{option.label}</Button>)}</div>
}
