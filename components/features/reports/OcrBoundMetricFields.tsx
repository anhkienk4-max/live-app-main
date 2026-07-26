'use client'

import React from 'react'
import type { OcrReviewData } from '@/lib/types/database.types'
import {
  metricValueToInput,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'
import { OcrMetricReviewField } from '@/components/features/reports/OcrMetricReviewField'

interface OcrBoundMetricFieldsProps {
  metricKeys: readonly CanonicalMetricKey[]
  values: MetricState
  review?: OcrReviewData | null
  editable: boolean
  canReview: boolean
  onChange: (key: CanonicalMetricKey, value: string) => void
  onEdit?: (key: CanonicalMetricKey) => void
  onConfirm?: (key: CanonicalMetricKey) => void
  onReset?: (key: CanonicalMetricKey) => void
  onClear?: (key: CanonicalMetricKey) => void
}

export function OcrBoundMetricFields({
  metricKeys,
  values,
  review,
  editable,
  canReview,
  onChange,
  onEdit,
  onConfirm,
  onReset,
  onClear,
}: OcrBoundMetricFieldsProps) {
  return (
    <>
      {metricKeys.map(key => (
        <OcrMetricReviewField
          key={key}
          metricKey={key}
          metric={review?.metrics[key]}
          value={metricValueToInput(values[key])}
          editable={editable}
          canReview={canReview}
          onChange={value => onChange(key, value)}
          onEdit={onEdit ? () => onEdit(key) : undefined}
          onConfirm={onConfirm ? () => onConfirm(key) : undefined}
          onReset={onReset ? () => onReset(key) : undefined}
          onClear={onClear ? () => onClear(key) : undefined}
        />
      ))}
    </>
  )
}
