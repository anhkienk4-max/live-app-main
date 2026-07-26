'use client'

import type {
  OcrCropBox,
  OcrReviewData,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import { defaultOcrCrop } from '@/lib/utils/ocrImage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'

export function OcrCropPreview({
  imageUrl,
  platform,
  value,
  onChange,
  review,
  disabled = false,
}: {
  imageUrl: string
  platform: ReportDashboardPlatform
  value: OcrCropBox
  onChange: (value: OcrCropBox) => void
  review?: OcrReviewData | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const update = (field: keyof OcrCropBox, percent: string) => {
    const numeric = Number(percent)
    if (!Number.isFinite(numeric)) return
    onChange({ ...value, [field]: numeric / 100 })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t('kpiCropPreview')}</p>
          <p className="text-xs text-muted-foreground">{t('kpiCropHelp')}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={disabled || platform === 'other'} onClick={() => onChange(defaultOcrCrop(platform))}>
          {t('resetPlatformCrop')}
        </Button>
      </div>
      <div className="overflow-hidden rounded border bg-black/5">
        <div className="relative mx-auto w-fit max-w-full">
          <img src={imageUrl} alt={t('dashboardCropPreview')} className="block max-h-80 max-w-full object-contain" />
          <div
            className="pointer-events-none absolute border-2 border-emerald-500 bg-emerald-400/15 shadow-[0_0_0_9999px_rgba(0,0,0,.42)]"
            style={{
              left: `${value.left * 100}%`,
              top: `${value.top * 100}%`,
              width: `${value.width * 100}%`,
              height: `${value.height * 100}%`,
            }}
          />
          {process.env.NODE_ENV !== 'production' && review?.original_dimensions && (
            <SpatialDiagnosticOverlay review={review} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CropInput label={`${t('cropLeft')} %`} value={value.left} disabled={disabled} onChange={next => update('left', next)} />
        <CropInput label={`${t('cropTop')} %`} value={value.top} disabled={disabled} onChange={next => update('top', next)} />
        <CropInput label={`${t('cropWidth')} %`} value={value.width} disabled={disabled} onChange={next => update('width', next)} />
        <CropInput label={`${t('cropHeight')} %`} value={value.height} disabled={disabled} onChange={next => update('height', next)} />
      </div>
    </div>
  )
}

function SpatialDiagnosticOverlay({ review }: { review: OcrReviewData }) {
  const dimensions = review.original_dimensions
  if (!dimensions?.width || !dimensions.height) return null
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      preserveAspectRatio="none"
    >
      {Object.entries(review.metrics).map(([key, metric]) => {
        const label = metric.label_box
        const value = metric.value_box
        if (!label && !value) return null
        const labelCenter = label && {
          x: label.x + label.width / 2,
          y: label.y + label.height / 2,
        }
        const valueCenter = value && {
          x: value.x + value.width / 2,
          y: value.y + value.height / 2,
        }
        const confirmed = metric.status === 'confirmed' || metric.status === 'accepted'
        const color = confirmed ? '#22c55e' : '#f59e0b'
        return (
          <g key={key}>
            {label && <rect {...label} fill="none" stroke="#22c55e" strokeWidth="3" />}
            {value && <rect {...value} fill="none" stroke="#3b82f6" strokeWidth="3" />}
            {labelCenter && valueCenter && (
              <line
                x1={labelCenter.x}
                y1={labelCenter.y}
                x2={valueCenter.x}
                y2={valueCenter.y}
                stroke={color}
                strokeWidth="2"
              />
            )}
            <text
              x={value?.x ?? label?.x ?? 0}
              y={Math.max(12, (value?.y ?? label?.y ?? 0) - 4)}
              fill={color}
              fontSize="12"
              fontWeight="700"
            >
              {key} {Math.round((metric.pair_score ?? 0) * 100)}%
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function CropInput({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (value: string) => void }) {
  return <label className="text-xs font-medium">{label}<Input className="mt-1" type="number" min="0" max="100" step="1" disabled={disabled} value={Math.round(value * 100)} onChange={event => onChange(event.target.value)} /></label>
}
