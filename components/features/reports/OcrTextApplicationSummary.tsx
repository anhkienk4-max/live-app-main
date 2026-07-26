'use client'

import type { OcrTextApplicationResult } from '@/lib/utils/ocrReview'
import { metricTranslationKeys } from '@/lib/reportMetricLabels'
import { useTranslation } from '@/lib/i18n'

export function OcrTextApplicationSummary({
  result,
}: {
  result: OcrTextApplicationResult | null
}) {
  const { t } = useTranslation()
  if (!result) return null

  return (
    <div className="mt-2 space-y-2 rounded border bg-muted/40 p-3 text-xs" data-testid="ocr-application-summary">
      <p className="font-medium">
        {t('ocrApplySummary', {
          applied: result.appliedKeys.length,
          review: result.reviewRequiredKeys.length,
        })}
      </p>
      {result.appliedKeys.length > 0 && (
        <p><span className="font-medium">{t('ocrAppliedMetrics')}:</span>{' '}
          {result.appliedKeys.map(key => t(metricTranslationKeys[key])).join(', ')}
        </p>
      )}
      {result.reviewRequiredKeys.length > 0 && (
        <p className="text-amber-700"><span className="font-medium">{t('ocrNeedsReviewMetrics')}:</span>{' '}
          {result.reviewRequiredKeys.map(key => t(metricTranslationKeys[key])).join(', ')}
        </p>
      )}
      {result.unmappedLines.length > 0 && (
        <p><span className="font-medium">{t('ocrUnmappedLines')}:</span>{' '}
          {result.unmappedLines.join(' · ')}
        </p>
      )}
      {result.warnings.length > 0 && (
        <p className="text-amber-700"><span className="font-medium">{t('ocrWarnings')}:</span>{' '}
          {result.warnings.join(' · ')}
        </p>
      )}
    </div>
  )
}
